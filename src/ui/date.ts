export function getRelativeBackupDate(backupName: string): string {
  if (!backupName || backupName === 'none' || backupName === 'never') return 'Never';
  const match = backupName.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return 'Never';
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10) - 1; // 0-indexed month
  const day = parseInt(match[3], 10);
  const dateObj = new Date(year, month, day);
  if (isNaN(dateObj.getTime())) return 'Never';
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const backup = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  const diffTime = today.getTime() - backup.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1) return `${diffDays} days ago`;
  return 'Today';
}

export function getBackupLabel(backupName: string): string {
  const relative = getRelativeBackupDate(backupName);
  if (relative === 'Never') return backupName;
  const labelIndex = backupName.indexOf('Z-');
  const labelText = labelIndex !== -1 ? backupName.substring(labelIndex + 2) : backupName;
  return `${relative} (${labelText})`;
}
