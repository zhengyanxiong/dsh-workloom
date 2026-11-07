/** Error line shared by Loom create/edit forms. */
import { alert, failureCode } from './styles.ts'
import { failureKey } from '../../ui/failure.ts'
import type { Translate } from './types.ts'

export function FailureNotice({ failure, t }: { failure: string; t: Translate }) {
  const key = failureKey(failure)
  return <div role="alert" style={alert}>
    <p style={{ margin: 0 }}>{key === undefined ? t('state.error') : t(key)}</p>
    {failure !== 'invalid_form' && <code style={failureCode}>{failure}</code>}
  </div>
}

/** One repository row of the project form. */
