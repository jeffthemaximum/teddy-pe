require "rails_helper"

RSpec.describe "health", type: :request do
  it "answers on /healthz" do
    get "/healthz"
    expect(response).to have_http_status(:ok)
  end

  it "names itself at the root" do
    get "/"
    expect(response.body).to eq("Teddy PE API")
  end
end
