// role="alert" so a screen reader says it without being asked. The message
// comes from the API, which is careful about what it reveals.
export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}
