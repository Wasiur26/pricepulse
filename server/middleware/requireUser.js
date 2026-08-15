const User = require("../models/User");

async function requireUser(req, res, next) {
  const auth0Sub = req.header("x-user-sub")?.trim();

  if (!auth0Sub) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Missing x-user-sub header.",
    });
  }

  try {
    const email = req.header("x-user-email")?.trim() || undefined;
    const name = req.header("x-user-name")?.trim() || undefined;
    const picture = req.header("x-user-picture")?.trim() || undefined;

    const user = await User.findOneAndUpdate(
      { auth0Sub },
      {
        $set: {
          auth0Sub,
          ...(email ? { email } : {}),
          ...(name ? { name } : {}),
          ...(picture ? { picture } : {}),
          isActive: true,
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
      },
    );

    req.user = user;
    return next();
  } catch (error) {
    return res.status(500).json({
      error: "ServerError",
      message: "Failed to resolve user context.",
    });
  }
}

module.exports = {
  requireUser,
};
