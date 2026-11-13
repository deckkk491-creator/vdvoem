import React from 'react';
import { InTab } from '../../src/lib/inTab';
import DatesScreen from '../dates';

/** Тот же экран, что и /dates, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function DatesScreenTab() {
  return (
    <InTab>
      <DatesScreen />
    </InTab>
  );
}
