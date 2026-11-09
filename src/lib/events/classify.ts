/**
 * Shared event classifier (weekly GitHub reader and in-app live agenda):
 * is an event FOR children, and which adult category does it belong to.
 */
// Explicit signals that an event is FOR children (generic words like "laboratorio" or "ragazzi" alone are not enough).
export const KIDS = /bambin|per (?:i )?ragazz|ragazze e ragazzi|bimb|famigli|piccol[ie]|infanzia|0-18|zerodiciotto|under\s?1[0-6]|\bkids\b|letture animate|lettura animata|burattin|marionett|teatro ragazzi|teatro per ragazzi|nati per leggere|nati per la musica|\b(?:dai|da|dagli)\s?\d{1,2}\s?(?:ai|a)\s?\d{1,2}\s?anni|\bdai\s?\d{1,2}\s?anni|\b\d{1,2}\s?[-–]\s?\d{1,2}\s?anni|scuol[ae] (?:dell'infanzia|primari)/i;
// Events ABOUT children (talks, conferences) are not FOR children unless they say so explicitly.
export const TALK = /convegn|conferenz|seminari|tavola rotonda|presentazione del (?:libro|volume)|incontro pubblico|dibattito|webinar|giornata di studi|formazione per (?:insegnanti|educatori|docenti)/i;
export const STRONG_KIDS = /per (?:i )?bambin|per (?:le )?famigli|per (?:i )?ragazz|per (?:i )?piccol|\b(?:dai|da)\s?\d{1,2}\s?(?:ai|a)?\s?\d{0,2}\s?anni|\b\d{1,2}\s?[-–]\s?\d{1,2}\s?anni|letture animate|lettura animata|burattin|teatro ragazzi/i;
// Signals of adult-only content that win over a weak kids match.
export const ADULTS = /vietato ai minori|\+18|solo adulti|per adulti|\bover\s?18/i;

// Adults section: category from the text (culture, music & shows, food, parties, talks).
export function adultCategory(text: string): string {
  const t = text.toLowerCase();
  if (/dj ?set|\bdj\b|clubbing|club night|discoteca|disco |party|serata|after ?hour|techno|house music|karaoke|open bar/.test(t)) return "notte";
  if (/degustaz|vino|vini|wine|cantina|birra|aperitiv|cena |cene |food|enogastronom|mercato contadino|street food|cioccolat|tartuf|olio|chef|cucina/.test(t)) return "gusto";
  if (/sagra|fiera|festa|carneval|mercatin/.test(t)) return "festa";
  if (/concert|musica|jazz|blues|\brock\b|\bpop\b|\bindie\b|\brap\b|hip.?hop|\bmetal\b|\bpunk\b|\bfolk\b|cantautor|orchestra|sinfoni|filarmonic|quartetto|\btrio\b|\blive\b|\bband\b|\bcoro\b|opera lirica|recital|tour 20\d\d|in concerto|unplugged|acustico/.test(t)) return "musica";
  if (/teatro|spettacol|danza|balletto|commedia|cabaret|stand.?up|musical|circo|cinema|film|proiezion|rassegna/.test(t)) return "spettacolo";
  if (/mostra|museo|esposizion|visita guidata|pinacoteca|galleria|archeolog|arte /.test(t)) return "museo";
  if (/passeggiat|escursion|trekking|camminat|bici/.test(t)) return "natura";
  return "incontro";
}

/** True when the text is clearly for children (talks about children are not). */
export function isForKids(text: string): boolean {
  return KIDS.test(text) && !ADULTS.test(text) && !(TALK.test(text) && !STRONG_KIDS.test(text));
}
