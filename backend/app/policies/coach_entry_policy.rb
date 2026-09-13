class CoachEntryPolicy < ApplicationPolicy
  def index?  = user.coach?
  def show?   = user.coach? && record.user_id == user.id
  def create? = user.coach?
  def update? = show?

  class Scope < Scope
    # Only the coach reads coach entries, and only their own.
    def resolve = user&.coach? ? scope.where(user_id: user.id) : scope.none
  end
end
