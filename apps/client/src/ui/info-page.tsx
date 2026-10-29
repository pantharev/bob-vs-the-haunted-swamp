import type { ComponentChildren } from 'preact';
import { useHotkeys } from './app';

/** A page over another screen (title, pause, results) with a Back button; Escape goes back too. */
export function InfoPage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ComponentChildren;
}) {
  useHotkeys(
    (code) => {
      if (code === 'Escape' || code === 'Backspace') {
        onBack();
        return true;
      }
    },
    [onBack],
  );
  return (
    <div class="screen">
      <div class="panel info">
        <h1>{title}</h1>
        {children}
        <div class="actions">
          <button class="primary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
