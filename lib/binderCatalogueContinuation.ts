/** A slow public facts read may outlive the initial screen budget. */
export function continueBinderCatalogueRead(options: {
  read: () => Promise<readonly unknown[]>;
  isCurrent: () => boolean;
  claimReload: () => boolean;
  reload: () => void;
}) {
  let incomplete = false;
  let complete = false;
  let queued = false;
  const retryWhenReady = () => {
    if (!incomplete || !complete || queued || !options.isCurrent() || !options.claimReload()) return;
    queued = true;
    setTimeout(() => { if (options.isCurrent()) options.reload(); }, 0);
  };
  const settled = options.read().then((cards) => {
    complete = cards.length > 0;
    retryWhenReady();
  }).catch(() => undefined);
  return { settled, markIncomplete() { incomplete = true; retryWhenReady(); } };
}
