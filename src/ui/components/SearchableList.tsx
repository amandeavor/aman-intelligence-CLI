import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import SelectInput, { type ItemProps } from 'ink-select-input';
import { CustomIndicator } from './CustomSelect.js';
import { theme } from '../theme.js';
import Fuse from 'fuse.js';

export interface ListItem {
  label: string;
  value: string;
  description?: string;
  badge?: string;
  metadata?: string[];
  status?: string;
}

interface SearchableListProps {
  items: ListItem[];
  onSelect: (item: ListItem) => void;
  placeholder?: string;
}

const labelSeparator = '\u001f';

function encodeLabel(item: ListItem): string {
  return [
    item.label,
    item.status || '',
    item.metadata?.join(' | ') || '',
    item.description || '',
    item.badge || '',
  ].join(labelSeparator);
}

const RichItem: React.FC<ItemProps> = ({ isSelected = false, label }) => {
  const [title, status, metadata, description, badge] = label.split(labelSeparator);
  const secondary = metadata || (badge ? `Source: ${badge}` : '');
  const hasDetail = secondary || description;

  return (
    <Box flexDirection="column" marginBottom={hasDetail ? 1 : 0}>
      <Box>
        <Text color={isSelected ? theme.primary : theme.text} bold={isSelected}>
          {title}
        </Text>
        {status && (
          <Text color={theme.success}>
            {'  '}
            {status}
          </Text>
        )}
      </Box>
      {secondary && <Text color={theme.dim}>{secondary}</Text>}
      {description && <Text color={theme.secondary}>{description}</Text>}
    </Box>
  );
};

export const SearchableList: React.FC<SearchableListProps> = ({ items, onSelect, placeholder = 'Search...' }) => {
  const [query, setQuery] = useState('');

  let displayedItems = items;
  if (query.trim() !== '') {
    const fuse = new Fuse(items, {
      keys: ['label', 'description', 'metadata'],
      threshold: 0.3,
    });
    displayedItems = fuse.search(query).map((res) => res.item);
  }

  const selectItems = displayedItems.map((item) => ({
    label: encodeLabel(item),
    value: item.value,
  }));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.primary}>{'>'} </Text>
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder={placeholder}
        />
      </Box>
      <Box>
        {selectItems.length > 0 ? (
          <SelectInput items={selectItems} onSelect={(val) => {
            const selected = displayedItems.find(i => i.value === val.value);
            if (selected) onSelect(selected);
          }} itemComponent={RichItem} indicatorComponent={CustomIndicator} limit={8} />
        ) : (
          <Text color={theme.dim}>No results found.</Text>
        )}
      </Box>
    </Box>
  );
};
