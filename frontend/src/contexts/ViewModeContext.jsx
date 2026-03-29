import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { getViewMode, setViewMode, isMobileLayout } from '../utils/viewMode';

const ViewModeContext = createContext(null);

export function ViewModeProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id;

  const [mode, setModeState] = useState(() => userId ? getViewMode(userId) : 'auto');
  const [isMobile, setIsMobile] = useState(() => userId ? isMobileLayout(userId) : window.innerWidth <= 768);

  const recalc = useCallback(() => {
    setIsMobile(userId ? isMobileLayout(userId) : window.innerWidth <= 768);
  }, [userId]);

  // Пересчёт при изменении размера окна (для режима 'auto')
  useEffect(() => {
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [recalc]);

  // Перезагружаем режим при смене пользователя
  useEffect(() => {
    if (userId) {
      const m = getViewMode(userId);
      setModeState(m);
      setIsMobile(isMobileLayout(userId));
    }
  }, [userId]);

  const changeMode = (newMode) => {
    if (userId) setViewMode(userId, newMode);
    setModeState(newMode);
    if (newMode === 'mobile') setIsMobile(true);
    else if (newMode === 'desktop') setIsMobile(false);
    else setIsMobile(window.innerWidth <= 768);
  };

  return (
    <ViewModeContext.Provider value={{ mode, isMobile, changeMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
