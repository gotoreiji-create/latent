import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  buy,
  loadPlans,
  plansError,
  restore,
  type Plan,
} from '../lib/purchases';
import { colour, font } from '../lib/theme';

/**
 * SPEC §7 — the paywall.
 *
 * Annual is listed first and carries the emphasis, because §7.2 treats the year
 * as the correct unit of value rather than a discount: this app is opened about
 * once a month, and "how you changed" is not visible over four weeks.
 *
 * The copy follows §9 — assertions, no exclamation marks, no evaluative words,
 * nothing that argues. The cards themselves are the argument.
 */
export function Paywall({
  visible,
  onClose,
  onUnlocked,
}: {
  visible: boolean;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNote(null);
    loadPlans().then(setPlans);
  }, [visible]);

  const purchase = async (plan: Plan) => {
    setBusy(true);
    const result = await buy(plan);
    setBusy(false);
    if (result === 'bought') {
      onUnlocked();
      return;
    }
    // Backing out is a decision, not a failure; only a real failure is spoken.
    if (result === 'failed') setNote('That did not go through.');
  };

  const recover = async () => {
    setBusy(true);
    const ok = await restore();
    setBusy(false);
    if (ok) onUnlocked();
    else setNote('Nothing to restore on this account.');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.slug}>
            <Text style={styles.slugText}>LATENT PRO</Text>
            <View style={styles.rule} />
            <Pressable onPress={onClose} hitSlop={16}>
              <Text style={styles.slugText}>CLOSE</Text>
            </Pressable>
          </View>

          <Text style={styles.display}>Three more readings.</Text>

          <Text style={styles.body}>
            The hour your eyes open. The places you kept returning to. The one
            thing that moved most in the last three months.
          </Text>

          <Text style={styles.body}>
            Everything stays on this device, the same as the card you have
            already seen.
          </Text>

          <View style={styles.plans}>
            {plans === null ? (
              <ActivityIndicator color={colour.mark} />
            ) : plans.length === 0 ? (
              <>
                <Text style={styles.body}>
                  The store is not answering right now. Try again later.
                </Text>
                {/* Temporary: the failure is otherwise invisible on a build
                    installed from Play, which is the only place billing runs. */}
                {plansError() ? (
                  <Text style={styles.fine}>{plansError()}</Text>
                ) : null}
              </>
            ) : (
              plans.map((plan, i) => (
                <PlanRow
                  key={plan.pkg.identifier}
                  plan={plan}
                  lead={i === 0}
                  disabled={busy}
                  onPress={() => purchase(plan)}
                />
              ))
            )}
          </View>

          {note ? <Text style={styles.note}>{note}</Text> : null}

          <Pressable onPress={recover} disabled={busy} hitSlop={12}>
            <Text style={styles.restore}>Restore a purchase</Text>
          </Pressable>

          <Text style={styles.fine}>
            Subscriptions renew until cancelled. Cancel any time in Google Play.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PlanRow({
  plan,
  lead,
  disabled,
  onPress,
}: {
  plan: Plan;
  lead: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.plan,
        lead && styles.planLead,
        pressed && styles.planPressed,
      ]}
    >
      <View style={styles.planText}>
        <Text style={[styles.planPeriod, lead && styles.planPeriodLead]}>
          {plan.period === 'year' ? 'A year' : 'A month'}
        </Text>
        {plan.trialDays ? (
          <Text style={styles.planTrial}>
            {plan.trialDays} days free first
          </Text>
        ) : null}
      </View>
      <Text style={[styles.planPrice, lead && styles.planPriceLead]}>
        {plan.price}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colour.ground },
  // Android renders this modal full-screen whatever the presentation style, so
  // the top row has to clear the status bar itself.
  page: { paddingHorizontal: 24, paddingTop: 72, paddingBottom: 48, gap: 20 },

  slug: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slugText: {
    fontFamily: font.data,
    fontSize: 11,
    color: colour.mark,
    letterSpacing: 0.5,
  },
  rule: { flex: 1, height: 1, backgroundColor: colour.veil },

  display: {
    fontFamily: font.displayHeavy,
    fontSize: 32,
    lineHeight: 38,
    color: colour.ink,
    letterSpacing: -0.6,
    marginTop: 8,
  },
  body: {
    fontFamily: font.body,
    fontSize: 16,
    lineHeight: 24,
    color: colour.mark,
  },

  plans: { gap: 12, marginTop: 12 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colour.veil,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  // The year is the offer; the month is the comparison that makes it read.
  planLead: { borderColor: colour.ink, borderWidth: 2 },
  planPressed: { backgroundColor: colour.veil },
  planText: { gap: 4 },
  planPeriod: { fontFamily: font.body, fontSize: 16, color: colour.mark },
  planPeriodLead: { fontFamily: font.bodyMedium, color: colour.ink },
  planTrial: { fontFamily: font.data, fontSize: 12, color: colour.mark },
  planPrice: { fontFamily: font.data, fontSize: 18, color: colour.mark },
  planPriceLead: { color: colour.signal, fontSize: 22 },

  note: { fontFamily: font.body, fontSize: 14, color: colour.ink },
  restore: {
    fontFamily: font.data,
    fontSize: 12,
    color: colour.mark,
    letterSpacing: 0.5,
    marginTop: 8,
  },
  fine: {
    fontFamily: font.dataLight,
    fontSize: 11,
    lineHeight: 17,
    color: colour.mark,
    marginTop: 16,
  },
});
