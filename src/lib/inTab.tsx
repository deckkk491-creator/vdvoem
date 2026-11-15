import React, { createContext, useContext } from 'react';

/**
 * Экран из «Мы» (бюджет, копилка и т. д.) может открываться двумя путями:
 * поверх вкладок со стрелкой «Назад» или как отдельная вкладка нижней панели.
 * Во втором случае экрану нужно убрать «Назад», поднять кнопку «+» над панелью и оставить место внизу.
 */
const InTabContext = createContext(false);

export function InTab({ children }: { children: React.ReactNode }) {
  return <InTabContext.Provider value>{children}</InTabContext.Provider>;
}

/** true, если экран открыт вкладкой нижней панели */
export function useInTab(): boolean {
  return useContext(InTabContext);
}
