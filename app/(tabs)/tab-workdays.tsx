import React from 'react';
import { InTab } from '../../src/lib/inTab';
import WorkDaysScreen from '../workdays';

/** Тот же экран, что и /workdays, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function WorkDaysScreenTab() {
  return (
    <InTab>
      <WorkDaysScreen />
    </InTab>
  );
}
