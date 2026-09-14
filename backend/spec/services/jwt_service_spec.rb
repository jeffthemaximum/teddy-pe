require "rails_helper"

RSpec.describe JwtService do
  let(:user) { create(:user) }

  it "round-trips a user id" do
    token = described_class.encode(user: user)
    expect(described_class.decode(token)[:sub]).to eq(user.id)
  end

  it "rejects a token signed with another secret" do
    forged = JWT.encode({ sub: 1, exp: 1.day.from_now.to_i }, "not-our-secret", "HS256")
    expect { described_class.decode(forged) }.to raise_error(JwtService::InvalidToken)
  end

  it "rejects an expired token" do
    token = described_class.encode(user: user, ttl: -1.second)
    expect { described_class.decode(token) }.to raise_error(JwtService::InvalidToken)
  end

  it "rejects gibberish" do
    expect { described_class.decode("nonsense") }.to raise_error(JwtService::InvalidToken)
  end
end
