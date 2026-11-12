import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { humanError, supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';
import { useSpace } from '../providers/SpaceProvider';
import { sectionStyle, useTheme } from '../theme';
import { Body, Button, ErrorNote, Input, Sheet } from './ui';

/** Быстрое добавление в список покупок из меню «+» — не уходя с текущего экрана */
export function QuickBuySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const st = sectionStyle(c, 'shopping');
  const { space } = useSpace();
  const { userId } = useAuth();
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setQty('');
    setError(null);
    setAdded([]);
  }, [visible]);

  async function add() {
    const t = title.trim();
    if (!t || !space || !userId || busy) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase
      .from('items')
      .insert({ space_id: space.id, kind: 'shopping', title: t, quantity: qty.trim() || null, category: 'Продукты', done: false, created_by: userId });
    setBusy(false);
    if (e) return setError(humanError(e));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setAdded((list) => [...list, t]);
    setTitle('');
    setQty('');
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Добавить покупку"
      footer={<Button title="Добавить в список" onPress={add} loading={busy} disabled={!title.trim()} color={st.fg} />}
    >
      <Input label="Что купить" value={title} onChangeText={setTitle} placeholder="Молоко, корм, батарейки…" maxLength={200} autoFocus returnKeyType="done" submitBehavior="submit" onSubmitEditing={add} />
      <Input label="Количество (необязательно)" value={qty} onChangeText={setQty} placeholder="2 шт, 1 кг…" maxLength={40} />
      <ErrorNote text={error} />
      {added.length ? (
        <Body muted style={{ fontSize: 14 }}>
          В списке покупок: {added.join(', ')}. Можно добавить ещё.
        </Body>
      ) : (
        <Body muted style={{ fontSize: 13 }}>
          Попадёт в раздел «Покупки», в категорию «Продукты» — поменять её можно там.
        </Body>
      )}
    </Sheet>
  );
}
