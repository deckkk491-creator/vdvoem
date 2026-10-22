import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { RULE_META, nextDue } from './rule222';
import type { RuleEvent, RuleKind, Space } from './types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const PREFIX = 'rule222-';

export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

async function cancelRuleReminders(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

const BODY: Record<RuleKind, string> = {
  date: 'Пора устроить свидание 🕯️ Загляните в генератор идей.',
  place: 'Время открыть новое место 🧭 Куда отправимся на выходных?',
  country: 'Пора планировать новую страну ✈️',
};

/**
 * Пересоздаёт локальные напоминания правила 2-2-2.
 * Напоминание приходит за 2 дня (для страны — за 30 дней) до срока, в 10:00.
 */
export async function syncRuleReminders(space: Space | null, events: RuleEvent[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await cancelRuleReminders();
    if (!space?.rule222_enabled) return;
    const granted = await ensurePermission();
    if (!granted) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('rule222', {
        name: 'Правило 2-2-2',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const kinds: RuleKind[] = ['date', 'place', 'country'];
    for (const kind of kinds) {
      const { due } = nextDue(kind, space.rule222_start, events);
      const remind = new Date(due);
      remind.setDate(remind.getDate() - (kind === 'country' ? 30 : 2));
      remind.setHours(10, 0, 0, 0);
      if (remind.getTime() <= Date.now() + 60_000) {
        // срок уже близко/прошёл — напомним завтра утром
        remind.setTime(Date.now());
        remind.setDate(remind.getDate() + 1);
        remind.setHours(10, 0, 0, 0);
      }
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIX}${kind}`,
        content: { title: `Правило 2-2-2 · ${RULE_META[kind].title}`, body: BODY[kind] },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: remind,
          channelId: Platform.OS === 'android' ? 'rule222' : undefined,
        },
      });
    }
  } catch (e) {
    console.warn('syncRuleReminders failed', e);
  }
}
