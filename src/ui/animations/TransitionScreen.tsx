import React, { useEffect, useState } from 'react';
import { Box } from 'ink';
import { useAnimationMode } from './useAnimationMode.js';
import { Spinner } from './Spinner.js';
import { useResponsiveLayout } from '../layout.js';

interface TransitionScreenProps {
  message: string;
  children: React.ReactNode;
}

export const TransitionScreen = ({ message, children }: TransitionScreenProps) => {
  const mode = useAnimationMode();
  const { rows } = useResponsiveLayout();
  const [loading, setLoading] = useState(mode !== 'off');

  useEffect(() => {
    if (mode === 'off') {
      return;
    }

    const duration = mode === 'reduced' ? 250 : 150;
    const timer = setTimeout(() => {
      setLoading(false);
    }, duration);

    return () => clearTimeout(timer);
  }, [mode]);

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={1} height={rows} justifyContent="center" alignItems="center">
        <Spinner label={message} />
      </Box>
    );
  }

  return <>{children}</>;
};
