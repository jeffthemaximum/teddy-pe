Rails.application.routes.draw do
  # Liveness and readiness for Fly.
  mount OkComputer::Engine, at: "/healthz"

  namespace :api do
    namespace :v1 do
      post  "auth/login", to: "auth#login"
      get   "me",         to: "me#show"
      patch "me",         to: "me#update"
    end
  end

  root to: ->(_env) { [ 200, { "Content-Type" => "text/plain" }, [ "Teddy PE API" ] ] }
end
