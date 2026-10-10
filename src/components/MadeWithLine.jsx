// "Made with GST Billing Pro" line printed on bills of Free-plan accounts
// (shared/plans.js → removeBranding: false). Deliberately small and plain:
// it must never get in the way of the shop's own details.
export function MadeWithLine({ thermal = false }) {
  return (
    <div className="gbp-made-with" data-testid="made-with"
      style={thermal
        ? { padding: '4px 4px 2px', textAlign: 'center', fontSize: '0.8em', color: '#000' }
        : { padding: '0.35rem 2rem 0.5rem', textAlign: 'center', fontSize: '9px', color: '#64748b', letterSpacing: '0.02em' }}>
      Made with GST Billing Pro · gst-billing-pro.pages.dev
    </div>
  );
}
export default MadeWithLine;
