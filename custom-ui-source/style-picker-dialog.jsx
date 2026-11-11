function StylePickerDialog({ title, onClose, actions, children, className }) {
  const ref = l.useRef(null);
  const closeRef = l.useRef(onClose);
  const previousFocus = l.useRef(document.activeElement);
  closeRef.current = onClose;
  l.useEffect(() => {
    const dialog = ref.current;
    const cancel = event => { event.preventDefault(); closeRef.current(); };
    dialog.showModal();
    dialog.addEventListener('cancel', cancel);
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
      const previous = previousFocus.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-label={title}>
    <header><h2>{title}</h2>{actions}</header>{children}
  </dialog>;
}
