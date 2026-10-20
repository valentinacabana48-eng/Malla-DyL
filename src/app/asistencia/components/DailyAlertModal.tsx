'use client';
import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X, Users } from 'lucide-react';
import { ABSENCE_REASONS } from './asistenciaUtils';

interface WorkerEntry {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  scheduledShift: string | null;
}

interface AbsenceEntry {
  workerId: string;
  reason: string;
}

interface DailyAlertModalProps {
  date: string;
  dateLabel: string;
  workers: WorkerEntry[];
  onConfirm: (allPresent: boolean, absences: AbsenceEntry[]) => void;
  onClose: () => void;
}

export default function DailyAlertModal({
  dateLabel,
  workers,
  onConfirm,
  onClose,
}: DailyAlertModalProps) {
  const [step, setStep] = useState<'question' | 'select'>('question');
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  function toggleAbsent(id: string) {
    setAbsentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setReason(id: string, reason: string) {
    setReasons((prev) => ({ ...prev, [id]: reason }));
  }

  function setComment(id: string, comment: string) {
    setComments((prev) => ({ ...prev, [id]: comment }));
  }

  function handleAllPresent() {
    onConfirm(true, []);
  }

  function handleNotAll() {
    setStep('select');
  }

  function handleConfirmAbsences() {
    const absences: AbsenceEntry[] = Array.from(absentIds).map((id) => {
      const reason = reasons[id] || 'Falta injustificada';
      const comment = comments[id]?.trim();
      // If "Otro" is selected and there's a comment, use the comment as the reason
      const finalReason = reason === 'Otro' && comment ? comment : reason;
      return { workerId: id, reason: finalReason };
    });
    onConfirm(false, absences);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <AlertCircle size={18} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Control de Asistencia</h2>
              <p className="text-xs text-gray-500">{dateLabel}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {step === 'question' ? (
          <div className="p-6 flex flex-col items-center gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <Users size={28} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 text-base mb-1">¿Vinieron todas hoy?</h3>
              <p className="text-sm text-gray-500">
                {workers.length} trabajadora{workers.length !== 1 ? 's' : ''} con turno programado
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={handleAllPresent}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors"
              >
                <CheckCircle size={18} />
                Sí, todas presentes
              </button>
              <button
                onClick={handleNotAll}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-sm border border-red-200 transition-colors"
              >
                <XCircle size={18} />
                No, hubo faltas
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 pt-4 pb-2">
              <p className="text-sm text-gray-600">Selecciona quién no asistió y el motivo:</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-2">
              {workers.map((w) => {
                const isAbsent = absentIds.has(w.id);
                const currentReason = reasons[w.id] || 'Falta injustificada';
                const isOtro = currentReason === 'Otro';
                return (
                  <div
                    key={w.id}
                    className={`rounded-xl border transition-all ${isAbsent ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}
                  >
                    <button
                      onClick={() => toggleAbsent(w.id)}
                      className="w-full flex items-center gap-3 p-3 text-left"
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${w.avatarColor || 'bg-blue-100 text-blue-700'}`}
                      >
                        {w.initials}
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800">{w.name}</span>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isAbsent ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}
                      >
                        {isAbsent && <XCircle size={12} className="text-white" />}
                      </div>
                    </button>
                    {isAbsent && (
                      <div className="px-3 pb-3 space-y-2">
                        <select
                          value={currentReason}
                          onChange={(e) => setReason(w.id, e.target.value)}
                          className="w-full text-xs border border-red-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ABSENCE_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        {isOtro && (
                          <textarea
                            value={comments[w.id] || ''}
                            onChange={(e) => setComment(w.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Describe el motivo de la ausencia..."
                            rows={2}
                            className="w-full text-xs border border-red-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setStep('question')}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Volver
              </button>
              <button
                onClick={handleConfirmAbsences}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
              >
                Confirmar ({absentIds.size} falta{absentIds.size !== 1 ? 's' : ''})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
