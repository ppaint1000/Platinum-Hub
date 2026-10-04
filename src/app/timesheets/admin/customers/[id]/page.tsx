import { redirect } from 'next/navigation'

// One customer list now: Clients. Sites belong to a client (see Sites).
export default function EditCustomerPage() {
  redirect('/clients')
}
