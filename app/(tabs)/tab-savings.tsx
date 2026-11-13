import React from 'react';
import { InTab } from '../../src/lib/inTab';
import SavingsScreen from '../savings';

/** Тот же экран, что и /savings, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function SavingsScreenTab() {
  return (
    <InTab>
      <SavingsScreen />
    </InTab>
  );
}
