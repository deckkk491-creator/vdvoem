import React from 'react';
import { InTab } from '../../src/lib/inTab';
import Wishlists from '../wishlists';

/** Тот же экран, что и /wishlists, но вкладкой нижней панели (Настройки → «Нижняя панель») */
export default function WishlistsTab() {
  return (
    <InTab>
      <Wishlists />
    </InTab>
  );
}
