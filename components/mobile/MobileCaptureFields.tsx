export function MobilePhotoCaptureField({ name = "file" }: { name?: string }) {
  return (
    <label className="mobile-capture-field">
      <span>Take photo or upload file</span>
      <input accept="image/*,.pdf" capture="environment" name={name} type="file" />
    </label>
  );
}
