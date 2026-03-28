/**
 * Shared UI resolution for actual-expense create mutation failures (modal + inline form).
 */
import type { TFunction } from 'i18next'

import { normalizeApiMutationError } from './apiErrorNormalization'
import { formatKGS } from './utils'

export type ActualExpenseBalanceAlert = { title: string; hint: string }

export function resolveActualExpenseCreateMutationError(
  err: unknown,
  t: TFunction,
  formAmountStr: string,
): {
  balanceAlert: ActualExpenseBalanceAlert | null
  amountApiError: string
  apiError: string
} {
  const normalized = normalizeApiMutationError(err)

  if (normalized.kind === 'insufficient_balance') {
    const enteredNum = parseFloat(formAmountStr)
    const enteredDisplay = Number.isFinite(enteredNum)
      ? formatKGS(enteredNum)
      : formAmountStr.trim() || '—'
    const availDisplay = formatKGS(normalized.available)
    const key =
      normalized.account === 'CASH'
        ? 'expenses.form.errors.insufficientBalance.cash'
        : 'expenses.form.errors.insufficientBalance.bank'
    return {
      balanceAlert: {
        title: t(key, { available: availDisplay, entered: enteredDisplay }),
        hint: t('expenses.form.errors.insufficientBalanceHint'),
      },
      amountApiError: t('expenses.form.errors.insufficientBalanceAmountField'),
      apiError: '',
    }
  }

  if (normalized.kind === 'validation') {
    const am = normalized.fields.amount
    return {
      balanceAlert: null,
      amountApiError: am ?? '',
      apiError: normalized.summary || t('errors.api.badRequest'),
    }
  }

  if (normalized.kind === 'message') {
    return {
      balanceAlert: null,
      amountApiError: '',
      apiError: normalized.message,
    }
  }

  if (normalized.kind === 'bad_request') {
    return {
      balanceAlert: null,
      amountApiError: '',
      apiError: t('errors.api.badRequest'),
    }
  }

  const raw = normalized.message
  return {
    balanceAlert: null,
    amountApiError: '',
    apiError: raw.trim() ? raw : t('expenses.loadError'),
  }
}
