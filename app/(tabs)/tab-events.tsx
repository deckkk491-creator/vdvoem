import React from 'react';
import { InTab } from '../../src/lib/inTab';
import EventsScreen from '../events';

/** Тот же экран, что и /events, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function EventsScreenTab() {
  return (
    <InTab>
      <EventsScreen />
    </InTab>
  );
}
