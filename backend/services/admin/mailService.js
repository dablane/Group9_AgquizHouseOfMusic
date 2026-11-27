require('dotenv').config();
const nodemailer = require('nodemailer');

const configured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    })
  : null;

const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

exports.sendInvite = async ({ to, name, link, expiresAt }) => {
  const when = new Date(expiresAt).toLocaleDateString('en-PH',
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const first = String(name).split(' ')[0];

  if (!configured) {
    console.log(`\n── INVITE (email not configured) ──`);
    console.log(`To:      ${to}`);
    console.log(`Link:    ${link}`);
    console.log(`Expires: ${when}\n`);
    return false;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM || `RemDrumStudio <${process.env.SMTP_USER}>`,
    to,
    subject: "You're invited to RemDrumStudio",
    text: [
      `Welcome to the team, ${first}.`,
      ``,
      `The studio admin added you as a coach at RemDrumStudio.`,
      `Choose a password to log in and see your schedule:`,
      ``,
      link,
      ``,
      `This link works once and expires on ${when}.`,
      `If you weren't expecting this, you can ignore this email.`
    ].join('\n'),
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:40px 20px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(28,36,86,.12)">

        <!-- Gold top bar -->
        <tr><td style="height:4px;background:linear-gradient(90deg,#f0b429,#ffd97d,#f0b429)"></td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px 32px">

          <!-- Logo -->
          <div style="margin-bottom:28px">
            <span style="font-size:1.3rem;font-weight:800;color:#1b1b1f">Rem</span><span style="font-size:1.3rem;font-weight:800;color:#1c2456">Drum</span><span style="font-size:1.3rem;font-weight:800;color:#c98a00">Studio</span>
          </div>

          <h1 style="font-size:1.6rem;font-weight:800;color:#1c2456;margin:0 0 12px;letter-spacing:-.02em">
            Welcome to the team, ${esc(first)}
          </h1>
          <p style="font-size:.95rem;color:#5a5a6e;line-height:1.6;margin:0 0 24px">
            The studio admin added you as a coach at RemDrumStudio.<br>
            Choose a password to log in and see your schedule.
          </p>

          <!-- CTA Button -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr>
              <td style="background:#1c2456;border-radius:9px">
                <a href="${esc(link)}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:.95rem;font-weight:700;text-decoration:none;border-radius:9px">
                  Set your password
                </a>
              </td>
            </tr>
          </table>

          <!-- Expiry note -->
          <p style="font-size:.82rem;color:#5a5a6e;line-height:1.6;margin:0 0 6px">
            This link works <strong>once</strong> and expires on <strong>${esc(when)}</strong>.
          </p>
          <p style="font-size:.82rem;color:#8a8fa8;line-height:1.6;margin:0 0 20px">
            Button not working? Paste this link into your browser:<br>
            <a href="${esc(link)}" style="color:#1c2456;word-break:break-all">${esc(link)}</a>
          </p>

          <!-- Divider -->
          <hr style="border:none;border-top:1px solid #eaecf4;margin:0 0 20px">

          <p style="font-size:.78rem;color:#9aa5c0;margin:0;line-height:1.6">
            Weren't expecting this? You can ignore this email. Nothing changes until you set a password.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  });

  return true;
};