// Platinum Painters - supplier invoices from Gmail to Xero (Google Apps
// Script, in platinumpaintersnz@gmail.com's own Google account at
// script.google.com). Kept here for safekeeping; it doesn't run from the Hub.
//
// Every 15 minutes: new Resene / Aalto invoice emails get just their invoice
// PDF(s) sent to Xero's bills inbox (Xero makes a draft bill from each, and
// the Hub's morning sync puts it on the job). The original stays in the
// inbox, labelled "Sent to Xero". Only emails that arrive after setup() is run
// are sent, so nothing already in Xero is doubled up.
//
// To add a supplier: add a line to SEARCHES. To stop: Triggers (clock icon)
// -> delete the sendInvoicesToXero trigger.

const XERO_BILLS = 'bills.rzcx1.8z2wu1kw0cynp44q@xerofiles.com';
const SEARCHES = [
  'from:accounts@resene.co.nz subject:invoice has:attachment',
  'from:aaltopaint.co.nz subject:invoice has:attachment',
];
const LABEL = 'Sent to Xero';

// Run once: starts the 15-minute check and remembers when it was switched on.
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('startedAt')) props.setProperty('startedAt', String(Date.now()));
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sendInvoicesToXero')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendInvoicesToXero').timeBased().everyMinutes(15).create();
  GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
}

function sendInvoicesToXero() {
  const props = PropertiesService.getScriptProperties();
  const startedAt = Number(props.getProperty('startedAt') || Date.now());
  const sent = JSON.parse(props.getProperty('sentIds') || '[]');
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);

  for (const query of SEARCHES) {
    for (const thread of GmailApp.search(query + ' newer_than:7d', 0, 50)) {
      let sentOne = false;
      for (const message of thread.getMessages()) {
        if (message.getDate().getTime() < startedAt || sent.includes(message.getId())) continue;
        // Only the supplier's own emails (not replies in the same thread).
        const from = message.getFrom().toLowerCase();
        if (!from.includes('resene.co.nz') && !from.includes('aaltopaint.co.nz')) continue;
        const pdfs = message
          .getAttachments({ includeInlineImages: false })
          .filter((a) => a.getContentType() === 'application/pdf' || /\.pdf$/i.test(a.getName()));
        sent.push(message.getId());
        if (!pdfs.length) continue;
        GmailApp.sendEmail(XERO_BILLS, message.getSubject(), 'Sent automatically from platinumpaintersnz@gmail.com.', {
          attachments: pdfs,
          name: 'Platinum Painters',
        });
        sentOne = true;
      }
      if (sentOne) thread.addLabel(label);
    }
  }
  // Remember the last 500 sent so nothing goes twice.
  props.setProperty('sentIds', JSON.stringify(sent.slice(-500)));
}
