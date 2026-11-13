import React from 'react';
import { InTab } from '../../src/lib/inTab';
import BudgetScreen from '../budget';

/** Тот же экран, что и /budget, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function BudgetScreenTab() {
  return (
    <InTab>
      <BudgetScreen />
    </InTab>
  );
}
