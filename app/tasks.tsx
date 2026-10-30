import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBackground } from '../src/components/AppBackground';
import { useCalendarSheets } from '../src/components/calendar/CalendarSheets';
import { TasksPanel } from '../src/components/calendar/TasksPanel';
import { itemMenu } from '../src/components/ItemCard';
import { EmptyState, ErrorNote, Fab, pageStyle } from '../src/components/ui';
import { useCalendar } from '../src/hooks/useCalendar';
import { useSpace } from '../src/providers/SpaceProvider';
import { sectionStyle, useTheme } from '../src/theme';

/** Все задачи пространства: общие, мои, партнёра и сделанные */
export default function TasksScreen() {
  const { c } = useTheme();
  const st = sectionStyle(c, 'calendar');
  const insets = useSafeAreaInsets();
  const { space } = useSpace();
  const cal = useCalendar();
  const sheets = useCalendarSheets(cal, { spaceId: space?.id ?? null });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <AppBackground />
      <ScrollView contentContainerStyle={pageStyle(insets, insets.bottom + 110)}>
        {!space ? (
          <EmptyState emoji="✅" title="Нет пространства" text="Создай пространство или присоединись по коду, чтобы делить дела." />
        ) : (
          <>
            <ErrorNote text={cal.error} onRetry={cal.retry} />
            <TasksPanel
              cal={cal}
              onOpen={(t) => sheets.openEvent(t)}
              onLongPress={(t) => itemMenu(t.title, () => sheets.editEvent(t), () => sheets.deleteEvent(t))}
              onNew={() => sheets.openNew('task', null)}
            />
          </>
        )}
      </ScrollView>
      {space ? <Fab onPress={() => sheets.openNew('task', null)} color={st.fg} overTabBar={false} /> : null}
      {sheets.sheets}
    </View>
  );
}
