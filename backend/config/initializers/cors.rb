# The web app is the only browser origin that talks to this API. The native app
# sends no Origin header, so it needs no entry here.
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins ENV.fetch("WEB_ORIGIN", "http://localhost:5173").split(",")
    resource "/api/*",
      headers: :any,
      methods: %i[get post patch put delete options head],
      credentials: false
  end
end
