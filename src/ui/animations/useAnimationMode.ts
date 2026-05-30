import { useState, useEffect } from 'react';
import { config } from '../../config/index.js';

export function useAnimationMode(): 'off' | 'reduced' | 'normal' {
  const [mode, setMode] = useState<'off' | 'reduced' | 'normal'>(() => {
    return config.get('animationMode') || 'normal';
  });

  useEffect(() => {
    const unsubscribe = config.onDidChange('animationMode', (newVal) => {
      if (newVal) {
        setMode(newVal);
      }
    });
    return unsubscribe;
  }, []);

  return mode;
}
