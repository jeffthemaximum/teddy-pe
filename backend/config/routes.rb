Rails.application.routes.draw do
  # Liveness and readiness for Fly.
  mount OkComputer::Engine, at: "/healthz"

  namespace :api do
    namespace :v1 do
      post  "auth/login", to: "auth#login"
      get   "me",         to: "me#show"
      patch "me",         to: "me#update"
      get   "drills",       to: "drills#index"
      get   "drills/:slug", to: "drills#show"

      resources :program_years, only: %i[index show]
    end
  end

  root to: ->(_env) { [ 200, { "Content-Type" => "text/plain" }, [ "Teddy PE API" ] ] }

  # Anything that reaches here is a routing miss or an exception the
  # middleware raised, so it answers in the envelope rather than in Rails'
  # default shape.
  match "*unmatched", to: "api/v1/errors#show", via: :all
  get "/404", to: "api/v1/errors#show"
  get "/500", to: "api/v1/errors#show"
end
