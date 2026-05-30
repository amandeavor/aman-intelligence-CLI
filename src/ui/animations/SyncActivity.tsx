import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { useAnimationMode } from './useAnimationMode.js';
import { theme } from '../theme.js';

interface SyncActivityProps {
  label?: string;
}

export const SyncActivity = ({ label }: SyncActivityProps) => {
  const mode = useAnimationMode();
  const [frameIndex, setFrameIndex] = useState(0);

  const frames = ['◉', '◐', '◑', '◒'];

  useEffect(() => {
    if (mode === 'off') return;

    const intervalTime = mode === 'reduced' ? 240 : 110;
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % frames.length);
    }, intervalTime);

    return () => clearInterval(timer);
  }, [mode]);

  const frame = mode === 'off' ? frames[0] : frames[frameIndex];

  return (
    <Text color={theme.primary}>
      <Text bold>{frame}</Text>{label ? ` ${label}` : ''}
    </Text>
  );
};
