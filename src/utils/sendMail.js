import { getGmailAuthFromEnv, getMailTransport, getFromAddress } from "./mailerTransport.js";

export const sendMail = async (email, otp) => {
  const transport = getMailTransport();
  const { user } = getGmailAuthFromEnv();
  if (!transport || !user) {
    throw new Error(
      "Email transport not configured. Set EMAIL_USER and EMAIL_PASS (Gmail App Password).",
    );
  }

  await transport.sendMail({
    from: getFromAddress(user),
    to: email,
    subject: "Password Reset OTP",
    html: `
      <h2>Password Reset</h2>
      <p>Your OTP Code:</p>
      <h1>${otp}</h1>
      <p>This OTP will expire in 5 minutes.</p>
    `,
  });
};
