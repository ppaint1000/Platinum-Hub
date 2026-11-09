// The master switch for every automatic email to customers / clients:
//  - drip sequences (src/lib/drips/drips.ts)
//  - booking confirmations and day-before reminders (src/lib/schedule/customerEmails.ts)
//  - the customer's proposal reminder (src/lib/quotes/proposalFollowUps.ts)
//  - repaint and check-up reminders (src/lib/reminders/clientReminders.ts)
// While it's off, none of these go to customers. Emails to staff (the Hub's
// own notifications) are not affected. Set to true to turn them back on.
export const CUSTOMER_EMAILS_ON = false;
