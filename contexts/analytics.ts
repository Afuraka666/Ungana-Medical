import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { logEvent as logEventService } from '../services/analyticsService';
import type { LoggedEvent, AnalyticsContextType } from '../types';

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export const AnalyticsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [eventLog, setEventLog] = useState<LoggedEvent[]>([]);

  const logEvent = useCallback((eventName: string, params: Record<string, any> = {}) => {
    logEventService(eventName, params);
    setEventLog(prevLog => {
      const newEvent: LoggedEvent = {
        id: Date.now(),
        name: eventName,
        params,
        timestamp: new Date().toLocaleTimeString(),
      };
      // Keep the log from growing indefinitely
      return [newEvent, ...prevLog].slice(0, 50);
    });
  }, []);

  // Using React.createElement because this is a .ts file, not a .tsx file.
  return React.createElement(
    AnalyticsContext.Provider,
    { value: { logEvent, eventLog } },
    children
  );
};

export const useAnalytics = (): AnalyticsContextType => {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
};
