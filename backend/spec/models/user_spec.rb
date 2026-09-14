require "rails_helper"

RSpec.describe User do
  # The minimum had no test at all until it was lowered from 12 to 6, which
  # is why lowering it looked free. The number is a judgement about what is
  # behind the login, so it is asserted here from both sides: the next person
  # to move it finds out from the suite rather than from production.
  #
  # What actually holds an online guessing run is the throttle on
  # AuthController#login, 10 attempts in 3 minutes, and that is unchanged by
  # anything here. This minimum is the floor for the other case, where the
  # database itself leaks and bcrypt is all that is left.
  describe "password length" do
    it "refuses a password below the minimum" do
      user = build(:user, password: "12345")

      expect(user).not_to be_valid
      expect(user.errors[:password]).to be_present
    end

    it "accepts one at the minimum" do
      expect(build(:user, password: "abcdef")).to be_valid
    end

    # allow_nil on the validation, so saving a user again without touching the
    # password is not the same as setting a blank one. Changing a name must
    # not be a password change.
    it "leaves an existing password alone when it is not being set" do
      user = create(:user, password: "a-long-enough-password")
      digest = user.password_digest

      user.update!(name: "Renamed")

      expect(user.reload.password_digest).to eq(digest)
      expect(user.authenticate("a-long-enough-password")).to be_truthy
    end
  end
end
