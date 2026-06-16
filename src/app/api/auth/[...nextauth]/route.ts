// Route handler Auth.js (login / callback / signout Microsoft Entra ID).
// URL de callback : /api/auth/callback/microsoft-entra-id (declaree cote Entra ID).

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
