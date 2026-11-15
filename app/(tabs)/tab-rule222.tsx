import React from 'react';
import { InTab } from '../../src/lib/inTab';
import Rule222 from '../rule222';

/** Тот же экран, что и /rule222, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function Rule222Tab() {
  return (
    <InTab>
      <Rule222 />
    </InTab>
  );
}
