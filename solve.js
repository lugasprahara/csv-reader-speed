// SwiftCSV — a fast drop-in reader for broken CSV files.
//
// run(input) answers exactly what the reference reader answers for a case's
// {text, header}: {columns, rows, errors}. The reading policy (broken rows
// included) is the contest's own:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record at all;
//   - a CR outside quotes that is not part of a CRLF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled; "" inside it is one quote, and every CRLF or lone CR inside it
//     reads as one LF; whatever follows the closing quote, up to the next
//     comma or line break, is appended as it stands (quote_junk when any of
//     it is kept); a quote that never closes is a literal character and the
//     text after it is read again as an unquoted field
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row) or cut (long_row) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line the record
//     starts on (every LF, CRLF and lone CR inside quotes counted), row the
//     record's index in rows (null for the header), in the order met.
//
// The reference reads one character at a time and grows each field one
// character at a time. This reader returns the same answers by scanning
// instead: an unquoted field is one slice of the text between its start and
// its delimiter, a quoted field is found with indexOf and only the rare
// segment that holds a CR is rebuilt character by character, and nothing is
// allocated for a field beyond the string the answer itself needs.

// How a field ended: at a comma, at a line break, or at the end of the text.
const ENDED_COMMA = 0;
const ENDED_BREAK = 1;
const ENDED_END = 2;

const CH_COMMA = 44; // ,
const CH_QUOTE = 34; // "
const CH_LF = 10; // \n
const CH_CR = 13; // \r
const CH_BOM = 0xfeff;

/** The reference reader's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === CH_BOM) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null while it is the header).
  let recordLine = 1;
  let recordRow = null;

  // The field the scanners just read, and how it ended.
  let fieldValue = '';
  let fieldEnded = ENDED_END;
  let fieldAdded = 0; // characters the unquoted scanner kept (for quote_junk)

  function noteError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field: the characters from pos up to the next comma or
  // line break, starting from `value` with `added` characters already kept.
  // A CR not followed by LF is dropped (stray_cr); the field is then built
  // from the slices between the dropped CRs instead of one clean slice.
  function scanUnquoted(value, added) {
    let i = pos;
    let segStart = i; // start of the clean run not yet copied
    let built = null; // assembled value, once a stray CR forces assembly
    let kept = added;
    let ended = ENDED_END;
    let endAt = len;
    let next = len;
    while (i < len) {
      const c = text.charCodeAt(i);
      if (c === CH_COMMA) {
        ended = ENDED_COMMA;
        endAt = i;
        next = i + 1;
        break;
      }
      if (c === CH_LF) {
        ended = ENDED_BREAK;
        endAt = i;
        next = i + 1;
        line += 1;
        break;
      }
      if (c === CH_CR) {
        if (i + 1 < len && text.charCodeAt(i + 1) === CH_LF) {
          ended = ENDED_BREAK;
          endAt = i;
          next = i + 2;
          line += 1;
          break;
        }
        noteError('stray_cr');
        if (built === null) built = value;
        built += text.slice(segStart, i);
        kept += i - segStart;
        i += 1;
        segStart = i;
        continue;
      }
      i += 1;
    }
    if (built === null) {
      fieldValue =
        value === '' ? text.slice(segStart, endAt) : value + text.slice(segStart, endAt);
      fieldAdded = kept + (endAt - segStart);
    } else {
      fieldValue = built + text.slice(segStart, endAt);
      fieldAdded = kept + (endAt - segStart);
    }
    fieldEnded = ended;
    pos = next;
  }

  // Appends the quoted segment text[start, end) to `value`: a segment with
  // no CR is already exactly what the reference builds (each LF stays an LF,
  // only the line count needs adding); a segment holding a CR is rebuilt so
  // each CRLF and each lone CR becomes one LF.
  function quotedSegment(value, start, end) {
    const cr = text.indexOf('\r', start);
    if (cr === -1 || cr >= end) {
      let lf = text.indexOf('\n', start);
      while (lf !== -1 && lf < end) {
        line += 1;
        lf = text.indexOf('\n', lf + 1);
      }
      return value + text.slice(start, end);
    }
    let out = '';
    let seg = start;
    let i = start;
    while (i < end) {
      const c = text.charCodeAt(i);
      if (c === CH_CR) {
        out += text.slice(seg, i) + '\n';
        line += 1;
        i += i + 1 < end && text.charCodeAt(i + 1) === CH_LF ? 2 : 1;
        seg = i;
      } else {
        if (c === CH_LF) line += 1;
        i += 1;
      }
    }
    return value + out + text.slice(seg, end);
  }

  // Reads a quoted field whose opening quote is at pos.
  function scanQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let segStart = open + 1;
    let i = segStart;
    for (;;) {
      const q = text.indexOf('"', i);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field. Nothing the scan
        // passed over was recorded, so rewinding pos and line is the whole
        // of the undo.
        pos = open + 1;
        line = openLine;
        noteError('unterminated_quote');
        scanUnquoted('"', 0);
        return;
      }
      if (q > segStart) value = quotedSegment(value, segStart, q);
      if (text.charCodeAt(q + 1) === CH_QUOTE) {
        // A doubled quote is one quote in the field; the field goes on.
        value += '"';
        i = q + 2;
        segStart = i;
        continue;
      }
      // The closing quote.
      pos = q + 1;
      if (pos >= len) {
        fieldValue = value;
        fieldEnded = ENDED_END;
        fieldAdded = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === CH_COMMA) {
        pos += 1;
        fieldValue = value;
        fieldEnded = ENDED_COMMA;
        fieldAdded = 0;
        return;
      }
      if (c === CH_LF) {
        pos += 1;
        line += 1;
        fieldValue = value;
        fieldEnded = ENDED_BREAK;
        fieldAdded = 0;
        return;
      }
      if (c === CH_CR && pos + 1 < len && text.charCodeAt(pos + 1) === CH_LF) {
        pos += 2;
        line += 1;
        fieldValue = value;
        fieldEnded = ENDED_BREAK;
        fieldAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break (quote_junk, when any of it is kept).
      scanUnquoted(value, 0);
      if (fieldAdded > 0) noteError('quote_junk');
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === CH_LF) {
        pos += 1;
        line += 1;
      } else if (c === CH_CR && pos + 1 < len && text.charCodeAt(pos + 1) === CH_LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    let ended;
    do {
      quoted = pos < len && text.charCodeAt(pos) === CH_QUOTE;
      if (quoted) scanQuoted();
      else scanUnquoted('', 0);
      fields.push(fieldValue);
      ended = fieldEnded;
    } while (ended === ENDED_COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? columns ?? [] : null, rows, errors };
}
