require "rails_helper"

RSpec.describe "auth", type: :request do
  let!(:user) { create(:user, :coach, email: "jeff@example.com", password: "a-long-enough-password") }
  let(:token) { JwtService.encode(user: user) }

  describe "POST /api/v1/auth/login" do
    it "returns a jwt and the user" do
      post "/api/v1/auth/login", params: { email: "jeff@example.com", password: "a-long-enough-password" }
      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["jwt"]).to be_present
      expect(body["user"]).to include("email" => "jeff@example.com", "role" => "coach")
      expect(body["user"]).not_to have_key("password_digest")
    end

    it "ignores the case of the email" do
      post "/api/v1/auth/login", params: { email: "JEFF@Example.COM", password: "a-long-enough-password" }
      expect(response).to have_http_status(:ok)
    end

    it "refuses a wrong password with the standard envelope" do
      post "/api/v1/auth/login", params: { email: "jeff@example.com", password: "wrong" }
      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body)).to eq(
        "error" => { "code" => "unauthorized", "message" => "That email and password do not match." }
      )
    end

    it "says the same thing for an unknown email, so it leaks no account list" do
      post "/api/v1/auth/login", params: { email: "nobody@example.com", password: "whatever" }
      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body).dig("error", "message")).to eq("That email and password do not match.")
    end
  end

  describe "GET /api/v1/me" do
    it "returns the signed-in user" do
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body).dig("user", "email")).to eq("jeff@example.com")
    end

    it "refuses a missing token" do
      get "/api/v1/me"
      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body).dig("error", "code")).to eq("unauthorized")
    end

    it "refuses a token for a user who no longer exists" do
      # A real signature, a sub with no matching row: the shape of a token
      # for an account that has since been deleted.
      missing_user_token = JWT.encode({ sub: 999_999, exp: 1.day.from_now.to_i }, Rails.application.secret_key_base, "HS256")
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{missing_user_token}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "refuses a forged token" do
      forged = JWT.encode({ sub: user.id, exp: 1.day.from_now.to_i }, "wrong", "HS256")
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{forged}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "says nothing rather than guessing which athlete, once there are two" do
      create(:athlete, name: "Teddy Maxim")
      create(:athlete, name: "A Second Child")

      get "/api/v1/me", headers: { "Authorization" => "Bearer #{token}" }

      expect(response).to have_http_status(:ok)
      body = JSON.parse(response.body)
      expect(body["athlete"]).to be_nil
      expect(body["current_program_year_id"]).to be_nil
    end
  end

  describe "PATCH /api/v1/me" do
    it "updates the name" do
      patch "/api/v1/me", params: { user: { name: "Jeff Maxim" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(user.reload.name).to eq("Jeff Maxim")
    end

    it "refuses to promote itself" do
      viewer = create(:user)
      patch "/api/v1/me", params: { user: { role: "coach" } },
        headers: { "Authorization" => "Bearer #{JwtService.encode(user: viewer)}" }
      expect(response).to have_http_status(:ok)
      expect(viewer.reload.role).to eq("viewer")
    end

    it "refuses a password change with no current password" do
      patch "/api/v1/me", params: { user: { password: "a-new-long-password" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(422)
      body = JSON.parse(response.body)
      expect(body).to eq(
        "error" => { "code" => "wrong_password", "message" => "That current password does not match." }
      )
      # The whole point: this must read as a field error, not a dead token,
      # so a typo does not drop Teddy or his mother to the login screen.
      expect(body["error"]["code"]).not_to eq("unauthorized")
    end

    it "changes the password when the current password is correct" do
      patch "/api/v1/me",
        params: { user: { password: "a-new-long-password", current_password: "a-long-enough-password" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(user.reload.authenticate("a-new-long-password")).to be_truthy
    end

    it "hands back a fresh token on a password change, and it works" do
      patch "/api/v1/me",
        params: { user: { password: "a-new-long-password", current_password: "a-long-enough-password" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      new_jwt = JSON.parse(response.body)["jwt"]
      expect(new_jwt).to be_present

      get "/api/v1/me", headers: { "Authorization" => "Bearer #{new_jwt}" }
      expect(response).to have_http_status(:ok)
    end

    it "returns the payload unchanged, with no jwt key, on a plain name change" do
      patch "/api/v1/me", params: { user: { name: "Jeff Maxim" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)
      expect(JSON.parse(response.body)).not_to have_key("jwt")
    end
  end

  describe "a token issued before a password change" do
    it "stops working once that user changes their password" do
      old_token = JwtService.encode(user: user)
      patch "/api/v1/me",
        params: { user: { password: "a-new-long-password", current_password: "a-long-enough-password" } },
        headers: { "Authorization" => "Bearer #{old_token}" }
      expect(response).to have_http_status(:ok)

      get "/api/v1/me", headers: { "Authorization" => "Bearer #{old_token}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "leaves a token for a different user unaffected" do
      other = create(:user, password: "another-long-password")
      other_token = JwtService.encode(user: other)

      patch "/api/v1/me",
        params: { user: { password: "a-new-long-password", current_password: "a-long-enough-password" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)

      get "/api/v1/me", headers: { "Authorization" => "Bearer #{other_token}" }
      expect(response).to have_http_status(:ok)
    end

    it "still accepts a token with no pwd claim at all, even after the password changes" do
      # JwtService.encode always sets pwd now, so build a bare, hand-made
      # token the way an already-issued or hand-rolled one would look: a real
      # signature, no pwd claim. authorize_request's short-circuit is the only
      # thing keeping this working, and that is the one guarantee here worth
      # a direct test.
      no_pwd_claim_token = JWT.encode(
        { sub: user.id, iat: Time.current.to_i, exp: 1.day.from_now.to_i },
        Rails.application.secret_key_base,
        "HS256"
      )

      patch "/api/v1/me",
        params: { user: { password: "a-new-long-password", current_password: "a-long-enough-password" } },
        headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:ok)

      get "/api/v1/me", headers: { "Authorization" => "Bearer #{no_pwd_claim_token}" }
      expect(response).to have_http_status(:ok)
    end
  end

  describe "the error envelope" do
    it "renders a 422 as { error: { code, message } }" do
      patch "/api/v1/me", params: { user: { name: "" } }, headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(422)
      expect(JSON.parse(response.body)).to eq(
        "error" => { "code" => "unprocessable", "message" => "Name can't be blank" }
      )
    end

    it "renders a 400 as { error: { code, message } }" do
      patch "/api/v1/me", params: {}, headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:bad_request)
      body = JSON.parse(response.body)
      expect(body.keys).to eq(["error"])
      expect(body["error"]["code"]).to eq("bad_request")
      expect(body["error"]["message"]).to be_present
    end

    it "renders a 404 as { error: { code, message } }" do
      get "/api/v1/nope", headers: { "Authorization" => "Bearer #{token}" }
      expect(response).to have_http_status(:not_found)
      expect(JSON.parse(response.body)).to eq(
        "error" => { "code" => "not_found", "message" => "Not found." }
      )
    end

    it "never puts a top-level errors key on any failure body" do
      patch "/api/v1/me", params: { user: { name: "" } }, headers: { "Authorization" => "Bearer #{token}" }
      expect(JSON.parse(response.body)).not_to have_key("errors")
    end
  end
end
