import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import AiRecordModal from '@/components/AiRecordModal';

type AiRecordModalContextValue = {
  openAiRecord: () => void;
  closeAiRecord: () => void;
};

const AiRecordModalContext = createContext<AiRecordModalContextValue | null>(null);

export function AiRecordModalProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  const openAiRecord = useCallback(() => setVisible(true), []);
  const closeAiRecord = useCallback(() => setVisible(false), []);

  const value = useMemo(() => ({ openAiRecord, closeAiRecord }), [openAiRecord, closeAiRecord]);

  return (
    <AiRecordModalContext.Provider value={value}>
      {children}
      <AiRecordModal visible={visible} onRequestClose={closeAiRecord} />
    </AiRecordModalContext.Provider>
  );
}

export function useAiRecordModal(): AiRecordModalContextValue {
  const ctx = useContext(AiRecordModalContext);
  if (!ctx) {
    throw new Error('useAiRecordModal 必须在 AiRecordModalProvider 内使用');
  }
  return ctx;
}
