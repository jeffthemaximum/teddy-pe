require "rails_helper"

RSpec.describe "auth", type: :request do
  let!(:user) { create(:user, :coach, email: "jeff@example.com", password: "a-long-enough-password") }
  let(:token) { JwtService.encode(user_id: user.id) }

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
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{JwtService.encode(user_id: 999_999)}" }
      expect(response).to have_http_status(:unauthorized)
    end

    it "refuses a forged token" do
      forged = JWT.encode({ sub: user.id, exp: 1.day.from_now.to_i }, "wrong", "HS256")
      get "/api/v1/me", headers: { "Authorization" => "Bearer #{forged}" }
      expect(response).to have_http_status(:unauthorized)
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
        headers: { "Authorization" => "Bearer #{JwtService.encode(user_id: viewer.id)}" }
      expect(response).to have_http_status(:ok)
      expect(viewer.reload.role).to eq("viewer")
    end
  end
end
