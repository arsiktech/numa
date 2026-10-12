/** Saves text as a download in the browser. */
export async function saveTextFile(name: string, text: string, mime = 'application/json'): Promise<void> {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
