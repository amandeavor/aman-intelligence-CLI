import React from 'react';
import { Text } from 'ink';
import SelectInput, { type ItemProps } from 'ink-select-input';
import { theme } from '../theme.js';

export const CustomItem: React.FC<ItemProps> = ({ isSelected = false, label }) => {
  return (
    <Text color={isSelected ? theme.primary : theme.text} bold={isSelected}>
      {label}
    </Text>
  );
};

export const CustomIndicator: React.FC<{ isSelected?: boolean }> = ({ isSelected = false }) => {
  return (
    <Text color={theme.primary}>
      {isSelected ? '› ' : '  '}
    </Text>
  );
};

interface CustomSelectInputProps<T> {
  items: { label: string; value: T }[];
  onSelect: (item: { label: string; value: T }) => void;
  limit?: number;
}

export function CustomSelectInput<T>({ items, onSelect, limit }: CustomSelectInputProps<T>) {
  return (
    <SelectInput
      items={items as any}
      onSelect={onSelect as any}
      itemComponent={CustomItem}
      indicatorComponent={CustomIndicator}
      limit={limit}
    />
  );
}
