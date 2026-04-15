import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

export default function NotesScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();

  useEffect(() => {
    const notesTab = params.tab === 'schedule' ? 'schedule' : 'inspiration';
    router.replace(`/screens/memory?tab=inspiration&notesTab=${notesTab}`);
  }, [params.tab]);

  return null;
}
