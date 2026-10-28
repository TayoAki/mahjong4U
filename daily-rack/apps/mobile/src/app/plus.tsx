import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FREE_FEATURES, PLUS, PLUS_FEATURES, PLUS_REASONS, type PlusFeature } from '@daily-rack/core';
import { getConfig } from '../lib/api.ts';
import { usePlus } from '../lib/plus.tsx';
import { loadPlans, manageSubscription, type PlusPlan } from '../lib/purchases';
import { Body, Button, Card, Display, ErrorPanel, Eyebrow, Icon, Notice, Screen, TopBar } from '../components/ui.tsx';
import { Pip } from '../components/Pip.tsx';
import { Confetti } from '../components/Confetti.tsx';
import { celebrateHaptic } from '../lib/celebrate.ts';
import { colors, fonts } from '../theme.ts';

// The Plus screen: what's always free, what Plus adds, the plans with their real store
// prices, and the fine print the stores ask for. Never pushy: "Maybe later" is always there.

const APPLE_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export default function PlusScreen() {
  const { feature } = useLocalSearchParams<{ feature?: PlusFeature }>();
  const router = useRouter();
  const { plus, status, canBuy, purchase, restorePurchases } = usePlus();
  const [plans, setPlans] = useState<PlusPlan[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [burst, setBurst] = useState(0);
  const [links, setLinks] = useState<{ privacy: string | null; terms: string | null }>({ privacy: null, terms: null });

  useEffect(() => {
    void getConfig().then((c) => setLinks({ privacy: c.privacyUrl ?? null, terms: c.termsUrl ?? (Platform.OS === 'ios' ? APPLE_EULA : null) }));
  }, []);
  useEffect(() => {
    if (!canBuy) {
      setPlans([]);
      return;
    }
    loadPlans()
      .then((p) => {
        setPlans(p);
        setChosen(p[0]?.id ?? null);
      })
      .catch(() => setPlans([]));
  }, [canBuy]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const plan = plans?.find((p) => p.id === chosen) ?? null;
  const monthly = plans?.find((p) => p.kind === 'monthly');

  const subscribe = async () => {
    if (!plan) return;
    setBusy('buy');
    setError(null);
    try {
      if (await purchase(plan)) {
        setBurst((b) => b + 1);
        celebrateHaptic();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const restoreThem = async () => {
    setBusy('restore');
    setError(null);
    setNote(null);
    try {
      setNote((await restorePurchases()) ? 'Welcome back! Plus is on again.' : 'We didn’t find a Plus subscription on this store account.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (plus) {
    const renews = status?.until ? new Date(status.until).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
    return (
      <Screen>
        <TopBar title={PLUS.name} onBack={close} />
        <Confetti run={burst} />
        <View style={styles.hero}>
          <Pip mood="proud" size={120} />
          <Display size={32} center>
            You’re a Plus member!
          </Display>
          <Body muted center>
            {status?.source === 'everyone'
              ? 'Plus is on for everyone right now. Enjoy!'
              : renews
                ? `${status?.willRenew ? 'Renews' : 'Ends'} ${renews}. Thank you for supporting Daily Rack.`
                : 'Thank you for supporting Daily Rack.'}
          </Body>
        </View>
        <Card style={{ gap: 10 }} testID="plus-member">
          {PLUS_FEATURES.map((f) => (
            <Perk key={f} text={f} />
          ))}
        </Card>
        {canBuy && status?.source === 'revenuecat' && <Button title="Manage subscription" variant="secondary" onPress={() => void manageSubscription()} />}
        <Button title="Back to the game" variant="text" onPress={close} testID="plus-close" />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={{ gap: 8 }}>
          {error && <ErrorPanel message={error} />}
          {canBuy && plans && plans.length > 0 ? (
            <Button
              title={plan?.trial ? `Start my ${plan.trial.replace(' free trial', '')} free` : plan ? `Subscribe for ${plan.price}` : 'Choose a plan'}
              icon="check"
              disabled={!plan}
              loading={busy === 'buy'}
              onPress={() => void subscribe()}
              testID="plus-subscribe"
            />
          ) : null}
          <Button title="Maybe later" variant="text" onPress={close} testID="plus-later" />
        </View>
      }
    >
      <TopBar title={PLUS.name} onBack={close} />
      <View style={styles.hero}>
        <Pip mood={feature ? 'wave' : 'cheer'} size={110} />
        <Eyebrow>Daily Rack Plus</Eyebrow>
        <Display size={30} center>
          {feature ? 'This one comes with Plus' : 'Play more with Plus'}
        </Display>
        <Body center>{feature ? PLUS_REASONS[feature] : 'Everything you need to learn and play with friends stays free. Plus is for when you want more.'}</Body>
      </View>

      <Card style={{ gap: 10 }} testID="plus-features">
        <Text style={styles.cardTitle}>With Plus</Text>
        {PLUS_FEATURES.map((f) => (
          <Perk key={f} text={f} />
        ))}
      </Card>

      {plans === null ? null : canBuy && plans.length > 0 ? (
        <View style={{ gap: 10 }} accessibilityRole="radiogroup">
          {plans.map((p) => {
            const selected = p.id === chosen;
            const saving = p.kind === 'annual' && monthly ? savingPercent(p, monthly) : null;
            return (
              <Pressable
                key={p.id}
                onPress={() => setChosen(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.kind === 'annual' ? 'Yearly' : 'Monthly'}, ${p.price}${p.trial ? `, ${p.trial}` : ''}`}
                style={[styles.plan, selected && styles.planOn]}
                testID={`plus-plan-${p.kind}`}
              >
                <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>{p.kind === 'annual' ? 'Yearly' : 'Monthly'}</Text>
                  <Text style={styles.planDetail}>
                    {p.kind === 'annual' ? `${p.price} a year${p.perMonth ? ` (${p.perMonth} a month)` : ''}` : `${p.price} a month`}
                    {p.trial ? ` · ${p.trial}` : ''}
                  </Text>
                </View>
                {saving ? <Text style={styles.save}>Save {saving}%</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Notice>
          {Platform.OS === 'web'
            ? 'Plus is available in the Daily Rack app for iPhone and Android.'
            : 'Plans aren’t available right now. Check your connection, or try again in a little while.'}
        </Notice>
      )}

      <Card tone="sage" style={{ gap: 8 }}>
        <Text style={styles.cardTitle}>Always free</Text>
        {FREE_FEATURES.map((f) => (
          <Perk key={f} text={f} muted />
        ))}
      </Card>

      {note && <Notice>{note}</Notice>}
      {canBuy && <Button title="Restore purchases" variant="text" compact loading={busy === 'restore'} onPress={() => void restoreThem()} testID="plus-restore" />}
      {canBuy && (
        <Text style={styles.fine}>
          {plan?.trial ? `After the free trial, ${plan.price} is charged ${plan.kind === 'annual' ? 'each year' : 'each month'}. ` : ''}
          Payment goes through your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play account'}. Plus renews automatically unless you cancel at least 24 hours before the end of
          the current period; cancel any time in your {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} subscription settings.
        </Text>
      )}
      <View style={styles.links}>
        {links.terms && <Button title="Terms of use" variant="text" compact onPress={() => void Linking.openURL(links.terms!)} />}
        {links.privacy && <Button title="Privacy policy" variant="text" compact onPress={() => void Linking.openURL(links.privacy!)} />}
      </View>
    </Screen>
  );
}

function savingPercent(annual: PlusPlan, monthly: PlusPlan): number | null {
  const yearly = annual.pkg.product.price;
  const twelve = monthly.pkg.product.price * 12;
  if (!yearly || !twelve || yearly >= twelve) return null;
  return Math.round((1 - yearly / twelve) * 100);
}

function Perk({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <View style={styles.perk}>
      <Icon name="check" size={18} color={muted ? colors.online : colors.primary} />
      <Text style={[styles.perkText, muted && { color: colors.ink }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6 },
  cardTitle: { fontFamily: fonts.serif, fontSize: 20, color: colors.ink },
  perk: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  perkText: { flex: 1, fontSize: 16, lineHeight: 22, color: colors.ink },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 2, borderColor: colors.border, padding: 14 },
  planOn: { borderColor: colors.primary, backgroundColor: colors.pink },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },
  planTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  planDetail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  save: { fontSize: 13, fontWeight: '800', color: '#fff', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' },
  fine: { fontSize: 12, lineHeight: 17, color: colors.muted, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
});
