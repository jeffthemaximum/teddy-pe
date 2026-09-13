Rails.application.routes.draw do
  # Liveness and readiness for Fly.
  mount OkComputer::Engine, at: "/healthz"

  namespace :api do
    namespace :v1 do
      # Endpoints arrive in later tasks.
    end
  end

  root to: ->(_env) { [ 200, { "Content-Type" => "text/plain" }, [ "Teddy PE API" ] ] }
end
