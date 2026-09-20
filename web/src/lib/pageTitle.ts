import { useEffect } from 'react';

export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title?.trim() ? `${title.trim()} · Signet` : 'Signet';
  }, [title]);
}
