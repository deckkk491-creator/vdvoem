import React from 'react';
import { InTab } from '../../src/lib/inTab';
import TasksScreen from '../tasks';

/** Тот же экран, что и /tasks, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function TasksScreenTab() {
  return (
    <InTab>
      <TasksScreen />
    </InTab>
  );
}
